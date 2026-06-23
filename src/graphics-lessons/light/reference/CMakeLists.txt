add_executable(09_light main.cpp ${GLAD_SOURCE})

if(WIN32)
    target_link_libraries(09_light glfw opengl32)
endif()

foreach(FILE_NAME cube.vs cube.fs light.vs light.fs)
    add_custom_command(TARGET 09_light POST_BUILD
        COMMAND ${CMAKE_COMMAND} -E copy_if_different
        "${CMAKE_CURRENT_SOURCE_DIR}/${FILE_NAME}"
        "$<TARGET_FILE_DIR:09_light>/${FILE_NAME}"
    )
endforeach()