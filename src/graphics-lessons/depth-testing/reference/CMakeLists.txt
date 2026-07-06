add_executable(15_depth_testing main.cpp ${GLAD_SOURCE})

if(WIN32)
    target_link_libraries(15_depth_testing glfw opengl32)
endif()

foreach(FILE_NAME shader.vs shader.fs)
    add_custom_command(TARGET 15_depth_testing POST_BUILD
        COMMAND ${CMAKE_COMMAND} -E copy_if_different
        "${CMAKE_CURRENT_SOURCE_DIR}/${FILE_NAME}"
        "$<TARGET_FILE_DIR:15_depth_testing>/${FILE_NAME}"
    )
endforeach()
