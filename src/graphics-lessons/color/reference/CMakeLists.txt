add_executable(08_color color.cpp ${GLAD_SOURCE})

if(WIN32)
    target_link_libraries(08_color glfw opengl32)
endif()

foreach(FILE_NAME color.vs color.fs light.vs light.fs)
    add_custom_command(TARGET 08_color POST_BUILD
        COMMAND ${CMAKE_COMMAND} -E copy_if_different
        "${CMAKE_CURRENT_SOURCE_DIR}/${FILE_NAME}"
        "$<TARGET_FILE_DIR:08_color>/${FILE_NAME}"
    )
endforeach()